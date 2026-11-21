// The post's contents beside it: built from the article's h2s (so every post
// gets it without extra markup) and the section in view marked as you scroll.
// Optional: without JavaScript the post reads the same, without the list.
(function () {
  var nav = document.querySelector("[data-toc]");
  if (!nav) return;
  var heads = Array.prototype.slice.call(document.querySelectorAll(".prose h2[id]"));
  if (heads.length < 3) return;
  var title = document.createElement("p");
  title.className = "toc-title";
  title.textContent = "On this page";
  var list = document.createElement("ol");
  var links = heads.map(function (h) {
    var a = document.createElement("a");
    a.href = "#" + h.id;
    var copy = h.cloneNode(true);
    var anchor = copy.querySelector(".anchor");
    if (anchor) anchor.remove();
    a.textContent = copy.textContent.trim();
    var li = document.createElement("li");
    li.appendChild(a);
    list.appendChild(li);
    return a;
  });
  nav.appendChild(title);
  nav.appendChild(list);
  nav.hidden = false;

  var current = -1, queued = false;
  function mark() {
    queued = false;
    var line = window.innerHeight * 0.3, at = -1;
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].getBoundingClientRect().top <= line) at = i; else break;
    }
    if (at === current) return;
    if (current >= 0) links[current].removeAttribute("aria-current");
    if (at >= 0) links[at].setAttribute("aria-current", "true");
    current = at;
  }
  window.addEventListener("scroll", function () {
    if (!queued) { queued = true; window.requestAnimationFrame(mark); }
  }, { passive: true });
  window.addEventListener("resize", mark);
  mark();
})();
