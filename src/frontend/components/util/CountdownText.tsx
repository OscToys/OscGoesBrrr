import React, {useEffect, useState} from 'react';

interface Props {
    targetTime: number;
    children: (timeLeftMs: number) => React.ReactNode;
}

export function formatDuration(milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

export default function CountdownText({targetTime, children}: Props) {
    const [timeLeftMs, setTimeLeftMs] = useState(() => Math.max(0, targetTime - Date.now()));

    useEffect(() => {
        const update = () => setTimeLeftMs(Math.max(0, targetTime - Date.now()));
        update();
        const timer = window.setInterval(update, 1000);
        return () => window.clearInterval(timer);
    }, [targetTime]);

    return <>{children(timeLeftMs)}</>;
}
