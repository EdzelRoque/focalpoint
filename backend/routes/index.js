import userRoutes from './userRoutes.js';
import sessionRoutes from './sessionRoutes.js';
import classificationRoutes from './classificationRoutes.js';

const constructorMethod = (app) => {
    app.use('/auth', userRoutes);
    app.use('/api', sessionRoutes);
    app.use('/api', classificationRoutes);

    app.use(/(.*)/, (req, res) => {
        res.status(404).json({ error: 'Route Not found' });
    });
};

export default constructorMethod;