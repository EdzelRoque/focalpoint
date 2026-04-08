import { ObjectId } from 'mongodb';


// HELPERS FOR VALIDATION FUNCTIONS

const validateString = (str, varName) => {
    if (!str) throw `You must provide a ${varName}`;
    if (typeof str !== 'string') throw `${varName} must be a string`;
    if (str.trim().length === 0) throw `${varName} cannot be an empty string or just spaces`;
    return str.trim();
};


// EXPORTED VALIDATION FUNCTIONS

const validateUsername = (username) => {
    username = validateString(username, 'Username');
    if (username.length < 3) throw 'Username must be at least 3 characters long';
    return username;
};

const validateEmail = (email) => {
    email = validateString(email, 'Email');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) throw 'Invalid email format';
    return email.toLowerCase();
};

const validatePassword = (password) => {
  password = validateString(password, 'Password');
  if (password.length < 8) throw 'Password must be at least 8 characters long';

  let hasUpperCase = false;
  let hasLowerCase = false;
  let hasDigit = false;
  let hasSpecialChar = false;

  for (let i = 0; i < password.length; i++) {
    const char = password[i];
    if (char >= 'A' && char <= 'Z') hasUpperCase = true;
    if (char >= 'a' && char <= 'z') hasLowerCase = true;
    if (char >= '0' && char <= '9') hasDigit = true;
    if (char === '!' || char === '@' || char === '#' || char === '$' || char === '%' || char === '^' || char === '&' || char === '*' || char === '(' || char === ')') hasSpecialChar = true;
  }

  if (!hasUpperCase) throw 'Password must contain at least one uppercase letter';
  if (!hasLowerCase) throw 'Password must contain at least one lowercase letter';
  if (!hasDigit) throw 'Password must contain at least one digit';
  if (!hasSpecialChar) throw 'Password must contain at least one special character';
  return password;
};

const validateId = (id) => {
    id = validateString(id, 'ID');
    if (!ObjectId.isValid(id)) throw 'Invalid ID';
    return id;
}

const validateTimeString = (time) => {
    time = validateString(time, 'Time');
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/; // Matches HH:MM:SS format (24-hour)
    if (!timeRegex.test(time)) throw 'Time must be in HH:MM:SS format (24-hour)';
    return time;
};

const validateTimeDuration = (duration) => {
    if (!duration) throw 'You must provide a time duration';
    if (typeof duration !== 'number') throw 'Time duration must be a number';
    if (duration <= 0) throw 'Time duration must be a positive number';
    return duration;
};

const validate = (startTime, endTime) => {
    const [startHours, startMinutes, startSeconds] = startTime.split(':').map(Number);
    const [endHours, endMinutes, endSeconds] = endTime.split(':').map(Number);

    if (startHours < 0 || startHours > 23 || startMinutes < 0 || startMinutes > 59 || startSeconds < 0 || startSeconds > 59) {
        throw 'Invalid start time';
    }

    if (endHours < 0 || endHours > 23 || endMinutes < 0 || endMinutes > 59 || endSeconds < 0 || endSeconds > 59) {
        throw 'Invalid end time';
    }

    if (startHours > endHours || (startHours === endHours && startMinutes > endMinutes) || (startHours === endHours && startMinutes === endMinutes && startSeconds > endSeconds)) {
        throw 'Start time must be before end time';
    }

    return { startTime, endTime };
};

const validateSessionGoal = (sessionGoal) => {
    sessionGoal = validateString(sessionGoal, 'Session Goal');
    if (sessionGoal.length < 10) throw 'Session goal must be at least 10 characters long';
    return sessionGoal;
}

export { validateUsername, validateEmail, validatePassword, validateUserId, validateTimeString, validateTimeInterval, validateSessionGoal };