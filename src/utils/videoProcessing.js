import { spawn } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';

/**
 * Remux an uploaded video so playback starts instantly and seeking works immediately, instead of
 * staff needing to know or care about "web-optimized" export settings.
 *
 * MP4 files store an index of where each frame lives (the "moov atom"). Most phones/editors write
 * it at the END of the file — fine for local playback, but it means a browser streaming the file
 * over HTTP has to fetch the tail of a (possibly huge) file before it can start playing at all.
 * `-movflags +faststart` moves that index to the front. `-c copy` means this is a fast container
 * rewrite, not a re-encode — no quality loss, no meaningful CPU cost, just a few seconds even for a
 * large file. This has to run against real files (ffmpeg needs to seek backward while writing the
 * relocated index), so we round-trip through a temp directory rather than piping in-memory.
 *
 * @param {Buffer} inputBuffer
 * @returns {Promise<Buffer>}
 */
export async function remuxForFaststart(inputBuffer) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'exp-video-'));
  const inputPath = path.join(dir, 'input');
  const outputPath = path.join(dir, 'output.mp4');

  try {
    await writeFile(inputPath, inputBuffer);

    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, [
        '-y',
        '-i', inputPath,
        '-c', 'copy',
        '-movflags', '+faststart',
        outputPath,
      ]);

      let stderr = '';
      proc.stderr.on('data', (chunk) => { stderr += chunk; });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
      });
    });

    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
