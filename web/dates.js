window.GenealogyDates = {
  date(value) { return value ? value.split('-').reverse().join('.') : '?'; },
  part(person, prefix) {
    if (prefix === 'death' && person.isLiving === true) return '...';
    const value = person[prefix+'Date'];
    const note = person[prefix+'DateNote'];
    const text = this.date(value);
    return note ? `${text} (${note})` : text;
  },
  life(person) { return `${this.part(person,'birth')} – ${this.part(person,'death')}`; }
};
