// js/sidebar.js
const sidebar = document.getElementById("sidebar");

if (sidebar) {
  sidebar.innerHTML = `
    <div>
      <div class="nav__brand">THE AVOID</div>
      <div class="nav__subtitle">arts and crafts page</div>

      <div class="nav__section-title">NAVEGACIÓN</div>
      <ul class="nav__list">
        <li class="nav__item">
          <a href="index.html"
             class="nav__link"
             data-page-link="inicio">
            inicio
          </a>
        </li>
      </ul>

      <div class="nav__section-title">PROYECTOS FOTO</div>
      <ul class="nav__list">
        <li class="nav__item">
          <a href="proyecto-ejemplo.html"
             class="nav__link"
             data-page-link="londres">
            londres con amigos
          </a>
        </li>
        <li class="nav__item">
          <a href="prueba01.html"
             class="nav__link"
             data-page-link="prueba01">
            prueba01
          </a>
        </li>
        <li class="nav__item">
          <a href="prueba02.html"
             class="nav__link"
             data-page-link="prueba02">
            prueba02
          </a>
        </li>
        <li class="nav__item">
          <a href="prueba03.html"
             class="nav__link"
             data-page-link="prueba03">
            prueba03
          </a>
        </li>
        <li class="nav__item">
          <a href="prueba04.html"
             class="nav__link"
             data-page-link="prueba04">
            prueba04
          </a>
        </li>
        <li class="nav__item">
          <a href="prueba05.html"
             class="nav__link"
             data-page-link="prueba05">
            prueba05
          </a>
        </li>
      </ul>

      <div class="nav__section-title">CREATIVE CODING</div>
      <ul class="nav__list">
        <li class="nav__item">
          <a href="prueba05.html"
             class="nav__link"
             data-page-link="cc">
            sketches interactivos
          </a>
        </li>
      </ul>

      <div class="nav__section-title">CERÁMICAS</div>
      <ul class="nav__list">
        <li class="nav__item">
          <a href="prueba04.html"
             class="nav__link"
             data-page-link="ceramica">
            sketches interactivos
          </a>
        </li>
      </ul>
    </div>

    <div class="nav__footer">
      <div>contacto:<br>emperezfe@gmail.com</div>
      <div>cc · mdz · mlg. 2025.</div>
    </div>
  `;

  // marcar activo según data-page del <body>
  const currentPage = document.body.dataset.page;
  const links = sidebar.querySelectorAll("[data-page-link]");

  links.forEach((link) => {
    if (link.dataset.pageLink === currentPage) {
      link.classList.add("nav__link--active");
    }
  });
}
