const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Verifies the caller is a faculty member. Must come after authMiddleware.
const facultyOnly = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select('role');
    if (!user || user.role !== 'faculty') {
      return res.status(403).json({ message: 'Faculty access required' });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: 'Authorization check failed' });
  }
};

module.exports = authMiddleware;
module.exports.facultyOnly = facultyOnly;