// index.mjs
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const s3 = new S3Client({});

const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET;      // optional; defaults to same bucket
const OUTPUT_PREFIX = process.env.OUTPUT_PREFIX || "resized/";
const SOURCE_PREFIX = process.env.SOURCE_PREFIX || "original/";
const MAX_WIDTH = parseInt(process.env.MAX_WIDTH || "1200", 10);

export const handler = async (event) => {
  for (const record of event.Records ?? []) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    if (!key.startsWith(SOURCE_PREFIX)) {
      console.log(`Skipping non-source key: ${key}`);
      continue;
    }

    const outputBucket = OUTPUT_BUCKET || bucket;
    const outputKey = key.replace(SOURCE_PREFIX, OUTPUT_PREFIX);

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

    const resized = await sharp(body)
      .rotate() // respects EXIF orientation
      .resize({
        width: MAX_WIDTH,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toBuffer();

    await s3.send(
      new PutObjectCommand({
        Bucket: outputBucket,
        Key: outputKey,
        Body: resized,
        ContentType: contentType,
      })
    );

    console.log(`Resized ${bucket}/${key} -> ${outputBucket}/${outputKey}`);
  }

  return { ok: true };
};

