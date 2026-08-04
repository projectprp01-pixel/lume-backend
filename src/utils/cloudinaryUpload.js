import { v2 as cloudinary } from 'cloudinary';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } from '../config/env.js';

// Lazy configuration - only configure when first used
let configured = false;

const configureCloudinary = () => {
  if (!configured) {
    // Log environment variables for debugging
    console.log('🔧 Cloudinary Configuration:');
    console.log('  CLOUD_NAME:', CLOUDINARY_CLOUD_NAME ? '✓ Set' : '✗ Missing');
    console.log('  API_KEY:', CLOUDINARY_API_KEY ? '✓ Set' : '✗ Missing');
    console.log('  API_SECRET:', CLOUDINARY_API_SECRET ? '✓ Set' : '✗ Missing');

    // Configure Cloudinary
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET
    });

    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      console.error('❌ Cloudinary is NOT configured! Check your .env file.');
    } else {
      console.log('✅ Cloudinary configured successfully');
    }

    configured = true;
  }
};

/**
 * Upload file to Cloudinary
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} folder - Cloudinary folder path (e.g., 'checkin-ids')
 * @returns {Promise<string>} - Cloudinary file URL
 */
export const uploadToCloudinary = async (fileBuffer, folder = 'checkin-ids') => {
  // Configure on first use (lazy loading)
  configureCloudinary();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'auto',
        public_id: uuidv4(),
        // Generate secure URLs
        secure: true,
        // Optional: Add transformations for optimization
        transformation: [
          { quality: 'auto' },
          { fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary Upload Error:', error);
          reject(new Error('Failed to upload file to Cloudinary'));
        } else {
          resolve(result.secure_url);
        }
      }
    );

    // Convert buffer to stream and pipe to Cloudinary
    const stream = Readable.from(fileBuffer);
    stream.pipe(uploadStream);
  });
};
