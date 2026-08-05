import express from 'express';
import { loginStaff, getCurrentStaff } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', loginStaff);
router.get('/me', authenticate, getCurrentStaff);

export default router;
