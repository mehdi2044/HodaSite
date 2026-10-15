export type ScenePreviewProof = {
  sceneId: string;
  key: string;
  fingerprint: string;
};
async function videoFirstFrame(video: HTMLVideoElement) {
  if (video.readyState >= 2 && video.videoWidth > 0) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", loaded);
      video.removeEventListener("error", failed);
    };
    const loaded = () => {
      cleanup();
      video.videoWidth > 0 ? resolve() : reject(new Error("VIDEO_UNAVAILABLE"));
    };
    const failed = () => {
      cleanup();
      reject(new Error("VIDEO_UNAVAILABLE"));
    };
    const timer = setTimeout(failed, 8000);
    video.addEventListener("loadeddata", loaded, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.preload = "auto";
    video.load();
  });
}
/** Private preview only. Decode the exact rendered sources before binding consent. */
export async function decodedSceneProofs(root: Element) {
  const scenes = [
    ...root.querySelectorAll<HTMLElement>("[data-scene-id]"),
  ].filter((scene) => scene.getClientRects().length > 0);
  const results = await Promise.all(
    scenes.map(async (scene) => {
      const { sceneId, sceneConfirmation, sceneConfirmationKey } =
        scene.dataset;
      if (
        !sceneId ||
        !sceneConfirmationKey ||
        !/^[a-f0-9]{64}$/.test(sceneConfirmation ?? "")
      )
        return null;
      const images = [...scene.querySelectorAll<HTMLImageElement>("img")];
      if (!images.length) return null;
      try {
        await Promise.all(
          images.map(async (image) => {
            image.loading = "eager";
            await image.decode();
            if (!image.naturalWidth) throw new Error("IMAGE_UNAVAILABLE");
          }),
        );
        const related = scene.dataset.sceneRelatedVideo;
        if (related) {
          const player = [
            ...root.querySelectorAll<HTMLVideoElement>(
              "video[data-scene-video-proof]",
            ),
          ].find(
            (video) =>
              video.dataset.sceneVideoProof === sceneId &&
              new URL(video.src, location.href).href ===
                new URL(related, location.href).href,
          );
          if (!player) return null;
          await videoFirstFrame(player);
        }
      } catch {
        return null;
      }
      return {
        sceneId,
        key: sceneConfirmationKey,
        fingerprint: sceneConfirmation!,
      };
    }),
  );
  return {
    visibleSceneIds: scenes.flatMap((scene) =>
      scene.dataset.sceneId ? [scene.dataset.sceneId] : [],
    ),
    proofs: results.filter(
      (proof): proof is ScenePreviewProof => proof !== null,
    ),
  };
}
