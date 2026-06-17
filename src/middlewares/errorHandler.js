module.exports = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.isOperational ? err.message : 'Internal Server Error';
    if (!err.isOperational) console.error('💥 SYSTEM ERROR:', err);
    res.status(statusCode).json({ status: 'error', statusCode, message });
};