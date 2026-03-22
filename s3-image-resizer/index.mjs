// index.mjs
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const s3 = new S3Client({});

const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET;      // optional; defaults to same bucket
const SOURCE_PREFIX = process.env.SOURCE_PREFIX || "uploads/";
const RESIZED_PREFIX = process.env.RESIZED_PREFIX || "resized/";
const THUMB_PREFIX = process.env.THUMB_PREFIX || "thumbnail/";
const RESIZED_WIDTH = parseInt(process.env.RESIZED_WIDTH || "1200", 10);
const THUMB_WIDTH = parseInt(process.env.THUMB_WIDTH || "300", 10);
const JPEG_QUALITY = parseInt(process.env.JPEG_QUALITY || "80", 10);

export const handler = async (event) => {
  for (const record of event.Records ?? []) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    if (!key.startsWith(SOURCE_PREFIX)) {
      console.log(`Skipping non-source key: ${key}`);
      continue;
    }

    const outputBucket = OUTPUT_BUCKET || bucket;

    const input = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    const contentType = input.ContentType || "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      console.log(`Skipping non-image object: ${key} (${contentType})`);
      continue;
    }

    const body = await input.Body.transformToByteArray();
    const base = sharp(body).rotate();

    const [resized, thumbnail] = await Promise.all([
      base.clone().resize({ width: RESIZED_WIDTH, fit: "inside", withoutEnlargement: true }).jpeg({ quality: JPEG_QUALITY }).toBuffer(),
      base.clone().resize({ width: THUMB_WIDTH, fit: "inside", withoutEnlargement: true }).jpeg({ quality: Math.round(JPEG_QUALITY * 0.85) }).toBuffer(),
    ]);

    const resizedKey = key.replace(SOURCE_PREFIX, RESIZED_PREFIX);
    const thumbKey = key.replace(SOURCE_PREFIX, THUMB_PREFIX);

    await Promise.all([
      s3.send(new PutObjectCommand({ Bucket: outputBucket, Key: resizedKey, Body: resized, ContentType: "image/jpeg" })),
      s3.send(new PutObjectCommand({ Bucket: outputBucket, Key: thumbKey, Body: thumbnail, ContentType: "image/jpeg" })),
    ]);

    console.log(`Processed ${bucket}/${key} -> resized + thumbnail (JPEG)`);
  }

  return { ok: true };
};

