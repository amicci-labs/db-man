import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CommandResult {
    stdout: string;
    stderr: string;
}

export interface CommandOptions {
    timeout?: number;
}

export async function runCommand(
    command: string,
    args: string[],
    cwd: string,
    options: CommandOptions = {},
): Promise<CommandResult> {
    const result = await execFileAsync(command, args, {
        cwd,
        maxBuffer: 1024 * 1024 * 10,
        timeout: options.timeout ?? 30_000,
    });

    return {
        stderr: result.stderr,
        stdout: result.stdout,
    };
}

export async function runGit(args: string[], cwd: string): Promise<CommandResult> {
    return runCommand('git', args, cwd);
}
