import { describe, expect, it } from "vitest";
import { fittingFlight } from "@/components/storefront/fitting-ad-flight";

describe("MODA4 fitting flight", () => {
  it.each([720, 1100])(
    "keeps the projected image inside the %s-unit stage",
    (width) => {
      const height = 640;
      const perspective = 1300;
      const origin = { x: width / 2, y: height * 0.35 };
      const frame = { width, height, perspective, origin };
      const compact = width === 720;
      const cases = [
        {
          image: { width: 90, height: 65 },
          from: { x: 55, y: 116 },
          to: { x: width * 0.75, y: 48, rotation: 0, scale: 1.2 },
        },
        {
          image: { width: 118, height: 149 },
          from: { x: 62, y: 158 },
          to: { x: width * 0.75, y: 254, rotation: 8, scale: 1.5 },
        },
        {
          image: { width: 70, height: 174 },
          from: { x: 132, y: 187 },
          to: { x: width * 0.75, y: 500, rotation: -12, scale: 1.3 },
        },
      ];
      for (const { image, from, to } of cases) {
        const flight = fittingFlight(from, to, image, frame, compact);
        expect(flight(0)).toMatchObject({ ...from, scale: 1 });
        expect(flight(1)).toMatchObject({
          x: to.x,
          y: to.y,
          tilt: to.rotation,
          scale: to.scale,
        });
        for (let step = 0; step <= 200; step++) {
          const pose = flight(step / 200);
          const turn = (pose.turn * Math.PI) / 180;
          const tilt = (pose.tilt * Math.PI) / 180;
          for (const x of [-image.width / 2, image.width / 2]) {
            for (const y of [-image.height / 2, image.height / 2]) {
              const a = pose.scale * (x * Math.cos(tilt) - y * Math.sin(tilt));
              const b = pose.scale * (x * Math.sin(tilt) + y * Math.cos(tilt));
              const factor = perspective / (perspective + a * Math.sin(turn));
              const screenX =
                origin.x + (pose.x + a * Math.cos(turn) - origin.x) * factor;
              const screenY = origin.y + (pose.y + b - origin.y) * factor;
              expect(screenX).toBeGreaterThanOrEqual(-1e-8);
              expect(screenX).toBeLessThanOrEqual(width + 1e-8);
              expect(screenY).toBeGreaterThanOrEqual(-1e-8);
              expect(screenY).toBeLessThanOrEqual(height + 1e-8);
            }
          }
        }
      }
    },
  );
});
