import confetti from 'canvas-confetti';
import { useEffect } from 'react';

interface Props {
  kidName: string;
  kidImage: string | null;
  gifUrl: string | null;
  onDone: () => void;
}

const DURATION_MS = 4500;

export function Celebration({ kidName, kidImage, gifUrl, onDone }: Props) {
  useEffect(() => {
    const end = Date.now() + DURATION_MS - 500;
    const colors = ['#FFD02F', '#4262FF', '#F16C5F', '#5BC4BE', '#FFCDE4'];

    const tick = () => {
      if (Date.now() > end) return;
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 70,
        startVelocity: 55,
        origin: { x: 0, y: 0.85 },
        colors,
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 70,
        startVelocity: 55,
        origin: { x: 1, y: 0.85 },
        colors,
      });
      requestAnimationFrame(tick);
    };
    tick();
    // Big initial burst
    confetti({
      particleCount: 120,
      spread: 90,
      startVelocity: 45,
      origin: { x: 0.5, y: 0.4 },
      colors,
    });

    playFanfare();

    const t = window.setTimeout(onDone, DURATION_MS);
    return () => {
      window.clearTimeout(t);
      confetti.reset();
    };
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-8 pointer-events-none">
      <div className="pointer-events-auto flex flex-col items-center gap-6 rounded-feature bg-canvas px-12 py-10 shadow-elev-4 max-w-2xl">
        <div className="flex items-center gap-4">
          {kidImage ? (
            <img
              src={kidImage}
              alt={kidName}
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-yellow-light text-h2 text-yellow-dark">
              {kidName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="text-left">
            <div className="text-h1 text-ink leading-none">{kidName}</div>
            <div className="mt-1 text-h4 text-brand-coral">all done! 🎉</div>
          </div>
        </div>
        {gifUrl && (
          <img
            src={gifUrl}
            alt="celebration"
            className="max-h-72 rounded-xl object-contain"
          />
        )}
      </div>
    </div>
  );
}

function playFanfare(): void {
  const audio = new Audio('/trumpet.mp3');
  audio.volume = 0.8;
  audio.play().catch(() => synthesizeFanfare());
}

function synthesizeFanfare(): void {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    // C major arpeggio: C5 - E5 - G5 - C6
    const notes = [
      { freq: 523.25, time: 0.0, dur: 0.18 },
      { freq: 659.25, time: 0.18, dur: 0.18 },
      { freq: 783.99, time: 0.36, dur: 0.18 },
      { freq: 1046.5, time: 0.54, dur: 0.7 },
    ];
    const t0 = ctx.currentTime;
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = n.freq;
      const start = t0 + n.time;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + n.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + n.dur + 0.05);
    }
  } catch {
    // silent on Web Audio failure
  }
}
