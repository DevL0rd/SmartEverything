import { useState } from 'react';

export function useArrival(arriving: boolean): readonly [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(arriving);
  const [wasArriving, setWasArriving] = useState(arriving);
  if (arriving !== wasArriving) {
    setWasArriving(arriving);
    if (arriving) setOpen(true);
  }
  return [open, setOpen];
}
