export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  type?: 'access' | 'refresh';
}
