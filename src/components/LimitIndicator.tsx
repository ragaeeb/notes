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
    const safePercent = Number.isFinite(percent) ? percent : 0;
    const clampedPercent = Math.max(0, Math.min(safePercent, 100));
    const displayPercent = Math.round(clampedPercent);

    return (
        <div className="flex items-center gap-2" data-testid="limit-indicator">
            <div className="hidden w-20 overflow-hidden rounded-full bg-muted sm:block" style={{ height: '6px' }}>
                <div
                    className={cn('h-full transition-all', getColorClass(clampedPercent))}
                    data-testid="limit-indicator-bar"
                    role="progressbar"
                    aria-label="URL budget usage"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={displayPercent}
                    style={{ width: `${clampedPercent}%` }}
                />
            </div>
            <span className="whitespace-nowrap text-fg-dim text-xs">{displayPercent}%</span>
        </div>
    );
};

export default LimitIndicator;
