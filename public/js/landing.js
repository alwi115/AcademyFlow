(function(){
  const reveal = () => {
    const items = document.querySelectorAll('[data-reveal]');
    if(!('IntersectionObserver' in window)){
      items.forEach(el=>el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },{threshold:.12});
    items.forEach(el=>io.observe(el));
  };
  document.addEventListener('DOMContentLoaded', reveal);
})();