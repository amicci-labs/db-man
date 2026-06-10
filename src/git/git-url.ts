export interface ParsedGitUrl {
    host?: string;
    owner?: string;
    name?: string;
}

export function parseGitRemoteUrl(remoteUrl: string): ParsedGitUrl {
    const normalizedUrl = remoteUrl.replace(/^git\+/, '').replace(/\.git$/, '');
    const sshMatch = normalizedUrl.match(/^git@([^:]+):([^/]+)\/(.+)$/);

    if (sshMatch) {
        return {
            host: sshMatch[1],
            owner: sshMatch[2],
            name: sshMatch[3],
        };
    }

    try {
        const parsedUrl = new URL(normalizedUrl);
        const [owner, name] = parsedUrl.pathname.replace(/^\//, '').split('/');

        return {
            host: parsedUrl.host,
            owner,
            name,
        };
    } catch {
        return {};
    }
}

export function toSshGitUrl(owner: string, repositoryName: string, host = 'github.com'): string {
    return `git@${host}:${owner}/${repositoryName}.git`;
}
