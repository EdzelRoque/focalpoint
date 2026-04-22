const corsOptions = {
    origin: (origin, callback) => {
        const allowed = ['https://focalpoint-rho.vercel.app'];
        if (!origin) return callback(null, true);
        if (allowed.includes(origin) || /^chrome-extension:\/\//.test(origin)) {
            return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
};

export default corsOptions;
