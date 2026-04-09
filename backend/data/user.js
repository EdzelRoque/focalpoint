import { users } from '../config/mongoCollections.js';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import { 
    validateUsername, 
    validateEmail, 
    validatePassword } from '../validation.js';

export const register = async (username, email, password) => {
    // Get the users collection
    const userCollection = await users();

    // Validate username, email, and password (e.g., check for empty strings, valid email format, password strength)
    username = validateUsername(username);
    email = validateEmail(email);
    password = validatePassword(password);

    // Check if the username, email is already taken/registered
    const existingUsername = await userCollection.findOne({ username: username });
    const existingEmail = await userCollection.findOne({ email: email });

    if (existingUsername) throw 'Username is already taken';
    if (existingEmail) throw 'Email is already registered';

    // Hash the password using bcrypt before storing
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = {
        username: username,
        email: email,
        password: hashedPassword
    }

    // Insert the new user into the database
    const insertInfo = await userCollection.insertOne(newUser);
    if (!insertInfo.acknowledged || !insertInfo.insertedId) throw 'Could not add user';

    return {
        _id: insertInfo.insertedId.toString(),
        username: username,
        email: email
    };
};

export const login = async (email, password) => {
    // Get the users collection
    const userCollection = await users();

    // Validate email and password
    email = validateEmail(email);
    if (!password || typeof password !== 'string' || password.trim().length === 0) throw 'Invalid email or password';
    password = password.trim();

    // Find the user by email
    const user = await userCollection.findOne({ email: email.toLowerCase() });
    if (!user) throw 'Invalid email or password';

    // Compare the provided password with the stored hashed password
    const comparePassword = await bcrypt.compare(password, user.password);
    if (!comparePassword) throw 'Invalid email or password';

    return {
        _id: user._id.toString(),
        username: user.username,
        email: user.email
    };
};
