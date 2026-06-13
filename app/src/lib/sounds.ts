import successMp3 from "@/assets/success.mp3";

let successAudio: HTMLAudioElement | null = null;

function getSuccessAudio(): HTMLAudioElement {
  if (!successAudio) {
    successAudio = new Audio(successMp3);
  }
  return successAudio;
}

/** Unlock playback during a user gesture (call synchronously from click/submit). */
export function primeSuccessSound() {
  const audio = getSuccessAudio();
  void audio
    .play()
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
    })
    .catch(() => {});
}

export function playSuccessSound() {
  const audio = getSuccessAudio();
  audio.currentTime = 0;
  void audio.play().catch(() => {});
}
