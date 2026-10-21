import { useSyncExternalStore } from 'react';

// Tanıtım yalnızca ilk açılışta görünür; görüldüğü bu cihazda saklanır (localStorage, bkz. local-storage.native.ts).
const KEY = 'siftahgo.intro';
const listeners = new Set<() => void>();
let seen: boolean | undefined;

function read() {
  if (seen === undefined) {
    try {
      seen = localStorage.getItem(KEY) === '1';
    } catch {
      seen = false;
    }
  }
  return seen;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useIntroSeen() {
  return useSyncExternalStore(subscribe, read);
}

export function finishIntro() {
  seen = true;
  try {
    localStorage.setItem(KEY, '1');
  } catch {}
  listeners.forEach((l) => l());
}
