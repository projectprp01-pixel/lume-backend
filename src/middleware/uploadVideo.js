import multer from 'multer';

// Separate from the main `upload` middleware (5MB, images/PDF only) — video files are legitimately
// much larger, so this gets its own, higher limit rather than loosening the shared one for
// everything else that uses it.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only MP4, WebM, MOV and AVI videos are allowed.'), false);
  }
};

const uploadVideo = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB
  },
  fileFilter,
});

export default uploadVideo;
