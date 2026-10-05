import multer from 'multer';

// Configure multer for memory storage (we'll upload to S3 directly)
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, HEIC images and PDF files are allowed.'), false);
  }
};

// Configure multer. fileSize is the hard per-file ceiling; multer can't vary it
// by type, so we set it to the largest allowed (15MB for PDFs) and enforce the
// tighter per-type cap (images 10MB, PDFs 15MB) in the controllers.
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB hard ceiling (PDF cap; images capped at 10MB in-controller)
  },
  fileFilter: fileFilter
});

export default upload;
