import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { api, getStoredPin, setStoredPin } from '../api';
import { PinPad } from './PinPad';

export function PinGate() {
  const [unlocked, setUnlocked] = useState<boolean>(getStoredPin() !== null);

  if (unlocked) {
    return <Outlet />;
  }

  const handleSubmit = async (pin: string): Promise<boolean> => {
    const ok = await api.verifyPin(pin);
    if (ok) {
      setStoredPin(pin);
      setUnlocked(true);
    }
    return ok;
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <PinPad onSubmit={handleSubmit} />
    </div>
  );
}
