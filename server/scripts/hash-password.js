import { hashPassword } from '../password.js';

const password = process.argv[2];
if (!password) {
  console.error('用法：npm run hash-password -- \'管理员密码\'');
  process.exit(1);
}

try {
  console.log(hashPassword(password));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
