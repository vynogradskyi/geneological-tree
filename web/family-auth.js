/* Deliberately client-only prototype. This is not server authorization. */
window.GenealogyFamily = (() => {
  const enabled = document.documentElement.dataset.familyPrototype === 'true';
  const sessionKey = 'genealogy-family-session:' + location.pathname;
  let config = null, current = null;
  const publicUser = user => ({login:user.login, firstName:user.firstName, lastName:user.lastName});
  async function verify(password, user) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', iterations:user.iterations,
      salt:Uint8Array.from(atob(user.salt), c=>c.charCodeAt(0))}, key, 256);
    const actual = btoa(String.fromCharCode(...new Uint8Array(bits)));
    return actual === user.passwordHash;
  }
  async function ready() {
    if (!enabled) return null;
    try {
      const response = await fetch('web/family-users.json', {cache:'no-store'});
      if (!response.ok) throw Error('Nie można wczytać kont rodzinnych.');
      config = await response.json();
      if (config.version !== 1 || !Array.isArray(config.users)) throw Error('Nieprawidłowy plik kont.');
      let saved;
      try { saved = JSON.parse(sessionStorage.getItem(sessionKey)); } catch {}
      const user = config.users.find(u=>u.login===saved?.login && u.passwordHash===saved?.fingerprint);
      if (user) current = publicUser(user);
    } catch (error) { console.info('Family prototype:', error.message); }
    return current;
  }
  function mount({change, canLeave, message}) {
    if (!enabled) return;
    const $ = id=>document.getElementById(id), dialog=$('family-dialog'), form=$('family-login-form');
    $('family-controls').hidden=false;
    function refresh() {
      $('family-login').hidden=!!current;
      $('family-logout').hidden=!current;
      $('family-greeting').textContent=current?`Witaj, ${current.firstName} ${current.lastName}`:'';
    }
    refresh();
    $('family-login').onclick=()=>{form.reset();$('family-login-error').hidden=true;dialog.showModal();$('family-username').focus();};
    $('family-close').onclick=()=>dialog.close();
    form.onsubmit=async event=>{
      event.preventDefault();const submit=$('family-submit'),error=$('family-login-error');submit.disabled=true;error.hidden=true;
      try {
        if (!config) await ready();
        if (!config) throw Error('Nie można wczytać kont. Odśwież stronę.');
        const user=config.users.find(u=>u.login===form.elements.username.value.trim());
        if (!user || !await verify(form.elements.password.value,user)) throw Error('Nieprawidłowy login lub hasło.');
        await change(publicUser(user));
        current=publicUser(user);
        try {sessionStorage.setItem(sessionKey,JSON.stringify({login:user.login,fingerprint:user.passwordHash}));} catch {}
        form.reset();dialog.close();refresh();
      } catch(e) {error.textContent=e.message;error.hidden=false;form.elements.password.value='';}
      finally {submit.disabled=false;}
    };
    $('family-logout').onclick=async()=>{
      if (!canLeave()) {message('Masz niezapisane zmiany. Użyj „Zapisz” albo „Anuluj”.');return;}
      try {await change(null);current=null;try{sessionStorage.removeItem(sessionKey);}catch{}refresh();}
      catch(error){message(error.message);}
    };
  }
  return {enabled,ready,mount,verify,user:()=>current};
})();
