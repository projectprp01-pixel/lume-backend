import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_URL,
} from '../config/env.js';

// R2 is S3-compatible, so the regular AWS SDK works against it — just point it at R2's
// account-scoped endpoint instead of an AWS region. Region is required by the SDK but meaningless
// to R2, 'auto' is the value Cloudflare's own docs use.
let client = null;
function getClient() {
  if (!client) {
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
      throw new Error('R2 is not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL');
    }
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

/**
 * Upload a file buffer to R2 and return its public URL.
 * @param {Buffer} fileBuffer
 * @param {string} folder - e.g. 'experiences/videos'
 * @param {string} contentType - e.g. 'video/mp4'
 * @param {string} [extension] - e.g. 'mp4' (defaults to guessing from contentType)
 * @returns {Promise<string>}
 */
export async function uploadToR2(fileBuffer, folder, contentType, extension) {
  const ext = extension || (contentType.split('/')[1] || 'bin');
  const key = `${folder}/${uuidv4()}.${ext}`;

  await getClient().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    })
  );

  return `${R2_PUBLIC_URL}/${key}`;
}
