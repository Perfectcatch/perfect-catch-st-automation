/**
 * S3 Client Service
 *
 * Handles image uploads to AWS S3 for pricebook assets
 */

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createLogger } from '../lib/logger.js';
import config from '../config/index.js';
import crypto from 'crypto';
import path from 'path';

const logger = createLogger('s3Client');

// S3 Client singleton
let s3Client = null;

/**
 * Get or create S3 client
 */
export function getS3Client() {
  if (!s3Client) {
    if (!config.aws?.accessKeyId || !config.aws?.secretAccessKey) {
      throw new Error('AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
    }

    s3Client = new S3Client({
      region: config.aws.region || 'us-east-1',
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });

    logger.info('S3 client initialized', { region: config.aws.region });
  }

  return s3Client;
}

/**
 * Generate S3 key for pricebook images
 * Format: pricebook/{type}/{tenant_id}/{st_id}/{filename}
 */
export function generateS3Key(type, tenantId, stId, originalFilename) {
  const ext = path.extname(originalFilename) || '.jpg';
  const hash = crypto.createHash('md5').update(`${stId}-${originalFilename}`).digest('hex').substring(0, 8);
  return `pricebook/${type}/${tenantId}/${stId}/${hash}${ext}`;
}

/**
 * Get the public URL for an S3 object
 */
export function getPublicUrl(key) {
  const bucket = config.aws.s3Bucket;
  const region = config.aws.region || 'us-east-1';

  // If using CloudFront, return CloudFront URL
  if (config.aws.cloudfrontDomain) {
    return `https://${config.aws.cloudfrontDomain}/${key}`;
  }

  // Otherwise return S3 URL
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

/**
 * Upload an image buffer to S3
 */
export async function uploadImage(buffer, key, contentType = 'image/jpeg') {
  const client = getS3Client();
  const bucket = config.aws.s3Bucket;

  if (!bucket) {
    throw new Error('S3 bucket not configured. Set AWS_S3_BUCKET');
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'max-age=31536000', // 1 year cache
  });

  await client.send(command);

  const url = getPublicUrl(key);
  logger.debug('Image uploaded to S3', { key, url });

  return url;
}

/**
 * Upload a large file using multipart upload
 */
export async function uploadLargeFile(stream, key, contentType = 'image/jpeg') {
  const client = getS3Client();
  const bucket = config.aws.s3Bucket;

  const upload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: stream,
      ContentType: contentType,
      CacheControl: 'max-age=31536000',
    },
  });

  await upload.done();

  return getPublicUrl(key);
}

/**
 * Check if an object exists in S3
 */
export async function objectExists(key) {
  try {
    const client = getS3Client();
    const bucket = config.aws.s3Bucket;

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Upload pricebook image from URL or buffer
 */
export async function uploadPricebookImage(options) {
  const { type, tenantId, stId, filename, buffer, contentType } = options;

  const key = generateS3Key(type, tenantId, stId, filename);

  // Check if already exists
  const exists = await objectExists(key);
  if (exists) {
    logger.debug('Image already exists in S3', { key });
    return getPublicUrl(key);
  }

  // Upload
  const url = await uploadImage(buffer, key, contentType);
  return url;
}

export default {
  getS3Client,
  generateS3Key,
  getPublicUrl,
  uploadImage,
  uploadLargeFile,
  objectExists,
  uploadPricebookImage,
};
