import { Badge } from './ui/badge';

type VersionBadgeProps = { version: 'v1' | 'v2' | null };

const VersionBadge = ({ version }: VersionBadgeProps) => {
    return (
        <Badge data-testid="version-badge" variant="outline">
            {version ?? 'new'}
        </Badge>
    );
};

export default VersionBadge;
