import { Badge } from './ui/badge';

type VersionBadgeProps = { version: 'v1' | null };

const VersionBadge = ({ version }: VersionBadgeProps) => {
    return <Badge variant="outline">{version ?? 'new'}</Badge>;
};

export default VersionBadge;
