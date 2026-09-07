// Only assets intersecting the first viewport count toward home readiness.
// This remains an application readiness signal, not a hardware paint timestamp.
export async function waitForHomeVisuals(
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) return false;
  const images = Array.from(document.images).filter((image) => {
    const box = image.getBoundingClientRect();
    return (
      box.width > 0 &&
      box.height > 0 &&
      box.bottom > 0 &&
      box.right > 0 &&
      box.top < innerHeight &&
      box.left < innerWidth
    );
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  try {
    return await Promise.race([
      Promise.all([
        document.fonts.ready,
        ...images.map((image) => image.decode()),
      ]).then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), 10000);
        abort = () => resolve(false);
        signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
