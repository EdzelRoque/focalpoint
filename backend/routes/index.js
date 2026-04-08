import userRoutes from './userRoutes.js';

const constructorMethod = (app) => {
    app.use('/auth', userRoutes);

    app.use(/(.*)/, (req, res) => {
        res.status(404).json({ error: 'Route Not found' });
    });
};

export default constructorMethod;