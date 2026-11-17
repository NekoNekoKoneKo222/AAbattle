/** Registration and admin grants must use exactly the same username rules. */
export function normalizeAccountUsername(value){
  const username=String(value??'').normalize('NFKC').trim();
  if(!/^[\p{L}\p{N}_]{3,20}$/u.test(username))return null;
  return {username,key:username.toLocaleLowerCase('und')};
}
