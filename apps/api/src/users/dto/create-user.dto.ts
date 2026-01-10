export class CreateUserDto {
  email!: string;
  name!: string;
  password!: string;

  // for MVP, allow selecting system role names
  roles!: Array<'ADMIN' | 'STAFF'>;
}
