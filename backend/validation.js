// HELPERS FOR VALIDATION FUNCTIONS

const validateString = (str, varName) => {
    if (!str) throw `You must provide a ${varName}`;
    if (typeof str !== 'string') throw `${varName} must be a string`;
    if (str.trim().length === 0) throw `${varName} cannot be an empty string or just spaces`;
    return str.trim();
};


// IMPORTED VALIDATION FUNCTIONS

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


