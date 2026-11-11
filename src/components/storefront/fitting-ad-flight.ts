type Point = { x: number; y: number };
type Size = { width: number; height: number };
type FlightPose = Point & { turn: number; tilt: number; scale: number };
type FlightFrame = Size & { perspective: number; origin: Point };

const radians = Math.PI / 180;

function fitPose(
  pose: FlightPose,
  image: Size,
  frame: FlightFrame,
): FlightPose {
  const turn = pose.turn * radians;
  const tilt = pose.tilt * radians;
  const cosTurn = Math.cos(turn);
  const sinTurn = Math.sin(turn);
  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);
  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;
  let depth = 0;

  for (const x of [-image.width / 2, image.width / 2]) {
    for (const y of [-image.height / 2, image.height / 2]) {
      const tiltedX = x * cosTilt - y * sinTilt;
      const rotatedX = tiltedX * cosTurn;
      const rotatedY = x * sinTilt + y * cosTilt;
      const z = -tiltedX * sinTurn;
      // Solve the projected corner against each frame edge. The resulting
      // inset of the unprojected center scales linearly with the image.
      const perspective = z / frame.perspective;
      left = Math.max(left, frame.origin.x * perspective - rotatedX);
      right = Math.max(
        right,
        (frame.width - frame.origin.x) * perspective + rotatedX,
      );
      top = Math.max(top, frame.origin.y * perspective - rotatedY);
      bottom = Math.max(
        bottom,
        (frame.height - frame.origin.y) * perspective + rotatedY,
      );
      depth = Math.max(depth, z);
    }
  }

  const scale = Math.min(
    pose.scale,
    frame.width / (left + right),
    frame.height / (top + bottom),
    frame.perspective / (2 * depth),
  );
  return {
    ...pose,
    x: Math.max(left * scale, Math.min(pose.x, frame.width - right * scale)),
    y: Math.max(top * scale, Math.min(pose.y, frame.height - bottom * scale)),
    scale,
  };
}

export function fittingFlight(
  from: Point,
  to: Point & { rotation: number; scale: number },
  image: Size,
  frame: FlightFrame,
  compact: boolean,
) {
  const finish = {
    x: to.x,
    y: to.y,
    turn: 360,
    tilt: to.rotation,
    scale: to.scale,
  };
  const frames: { offset: number; pose: FlightPose }[] = [
    { offset: 0, pose: { ...from, turn: -24, tilt: 0, scale: 1 } },
    {
      offset: 0.025,
      pose: { ...from, y: from.y - 2, turn: -23, tilt: 0, scale: 1 },
    },
    {
      offset: 0.22,
      pose: { ...from, y: from.y - 70, turn: 0, tilt: 0, scale: 1.08 },
    },
    {
      offset: 0.62,
      pose: {
        x: from.x + (to.x - from.x) * 0.55,
        y: to.y - (compact ? 115 : 160),
        turn: 200,
        tilt: -6,
        scale: (1 + to.scale) / 2,
      },
    },
    { offset: 0.97, pose: finish },
    { offset: 1, pose: finish },
  ].map(({ offset, pose }) => ({ offset, pose: fitPose(pose, image, frame) }));

  return (progress: number) => {
    const nextIndex = frames.findIndex(
      (keyframe) => keyframe.offset >= progress,
    );
    if (nextIndex <= 0)
      return frames[nextIndex === 0 ? 0 : frames.length - 1].pose;
    const previous = frames[nextIndex - 1];
    const next = frames[nextIndex];
    const fraction =
      (progress - previous.offset) / (next.offset - previous.offset);
    const interpolate = (key: keyof FlightPose) =>
      previous.pose[key] + (next.pose[key] - previous.pose[key]) * fraction;
    // Rotation can widen the projected image between two safe keyframes.
    return fitPose(
      {
        x: interpolate("x"),
        y: interpolate("y"),
        turn: interpolate("turn"),
        tilt: interpolate("tilt"),
        scale: interpolate("scale"),
      },
      image,
      frame,
    );
  };
}
