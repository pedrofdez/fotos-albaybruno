# Fotos Alba & Bruno

Wedding photo upload app for guests. Sign in with Google, upload photos directly to S3, and browse the gallery.

## Setup

### 1. Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or select an existing one)
3. Go to **APIs & Services > Credentials**
4. Click **Create Credentials > OAuth client ID**
5. Application type: **Web application**
6. Add authorized redirect URI: `http://localhost:3000/auth/google/callback` (or your production URL)
7. Copy the **Client ID** and **Client Secret** into `.env`

### 2. AWS S3 Bucket

Create an S3 bucket and apply this CORS configuration (Bucket > Permissions > CORS):

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT"],
    "AllowedOrigins": ["http://localhost:3000"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace `AllowedOrigins` with your production URL if deploying.

Create an IAM user with `s3:PutObject` and `s3:GetObject` permissions on the bucket and add the credentials to `.env`.

Make sure objects are publicly readable (or use a CloudFront distribution). The simplest approach: disable "Block all public access" on the bucket and add this bucket policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicRead",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    }
  ]
}
```

### 3. Environment variables

```bash
cp .env.example .env
```

Fill in all values in `.env`.

### 4. Install & Run

```bash
npm install
node index.js
```

The app runs at http://localhost:3000 by default.
