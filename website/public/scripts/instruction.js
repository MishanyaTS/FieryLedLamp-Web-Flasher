(() => {
const manualSearch = document.querySelector("#manualSearch");
  if (manualSearch) {
    const sections = [...document.querySelectorAll(".manual-section")];
    const noResults = document.querySelector("#manualNoResults");
    manualSearch.addEventListener("input", () => {
      const q = manualSearch.value.trim().toLowerCase();
      let visible = 0;
      sections.forEach(section => {
        const match = !q || section.textContent.toLowerCase().includes(q);
        section.hidden = !match;
        if (match) visible++;
      });
      if (noResults) noResults.hidden = visible !== 0;
    });
  }

})();

(() => {
  const navigation = document.querySelector("#manualNav");
  if (!navigation) return;
  const compact = matchMedia("(max-width:800px)");
  const setInitialState = () => { navigation.open = !compact.matches; };
  setInitialState();
  compact.addEventListener("change", setInitialState);
  navigation.addEventListener("click", event => {
    if (compact.matches && event.target.closest("a")) navigation.open = false;
  });
})();
