import { cn } from '../lib/utils';

type LimitIndicatorProps = { percent: number };

const getColorClass = (percent: number): string => {
    if (percent >= 85) {
        return 'bg-red-500';
    }

    if (percent >= 60) {
        return 'bg-amber-400';
    }

    return 'bg-emerald-400';
};

const LimitIndicator = ({ percent }: LimitIndicatorProps) => {
    const clampedPercent = Math.max(0, Math.min(percent, 100));

    return (
        <div className="w-full max-w-[220px]" data-testid="limit-indicator">
            <div className="mb-1 flex items-center justify-between text-slate-300 text-xs">
                <span>Budget</span>
                <span>{Math.round(clampedPercent)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
                <div
                    className={cn('h-full transition-all', getColorClass(clampedPercent))}
                    data-testid="limit-indicator-bar"
                    style={{ width: `${clampedPercent}%` }}
                />
            </div>
        </div>
    );
};

export default LimitIndicator;
