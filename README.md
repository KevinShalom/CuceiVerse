# CuceiVerse 🎓🌌

**CuceiVerse** es una plataforma estudiantil Full-Stack distribuida diseñada para modernizar, unificar y centralizar los servicios académicos, administrativos y de navegación física del centro universitario **CUCEI**. 

La plataforma integra navegación espacial en 2D interactiva acelerada por hardware, integración asíncrona con sistemas escolares heredados, y funcionalidades dinámicas gamificadas para mejorar la experiencia diaria de la comunidad universitaria.

---

## 🏗️ Arquitectura del Proyecto

El repositorio está estructurado como un sistema distribuido y modular que consta de tres componentes principales:

1. **`CuceiVerse WEB` (Frontend & Backend Core):**
   * **Frontend:** Desarrollado con **React**, **TypeScript** y **PixiJS (WebGL)** para el mapa interactivo del campus 2D.
   * **Backend:** Construido sobre **NestJS** con **Prisma ORM** y **PostgreSQL**, gestionando las APIs modulares, inyección de dependencias y autenticación con proxy JWT.

2. **`Horarios API` (Web Scraping & Data Extraction):**
   * Microservicio en **Python** encargado de extraer de forma automática y estructurada la información de horarios, profesores y materias directamente desde los sistemas legacy de la universidad.

3. **`habbo-avatar-generator` (Servicio de Gamificación):**
   * Microservicio independiente alojado en contenedores **Docker** enfocado en generar dinámicamente avatares personalizables para los estudiantes de la plataforma.

---

## 🚀 Funcionalidades Clave

* **Navegación del Campus 2D interactiva:** Renderizado de mapa dinámico en tiempo real utilizando **PixiJS** con soporte de WebGL. Cuenta con un buscador de rutas optimizado mediante el algoritmo de búsqueda heurística **A* (Pathfinding)** para guiar a los alumnos entre edificios y aulas del centro universitario.
* **Integración Legacy y Caché Inteligente:** Proxy de autenticación segura vía **JWT** con un sistema de caching avanzado (*Session Snapshot Caching*) que reduce la carga repetitiva de datos en los servidores universitarios.
* **Extracción Automatizada de Horarios:** Consumo e importación automática de horarios académicos mediante scripts inteligentes de **Web Scraping** en Python.
* **Gamificación y Personalización:** Creación y almacenamiento de avatares interactivos para los perfiles estudiantiles.

---

## 🛠️ Tecnologías y Herramientas Utilizadas

* **Lenguajes:** TypeScript, JavaScript, Python, C++
* **Frontend:** React, Tailwind CSS, PixiJS (WebGL Rendering engine)
* **Backend:** NestJS, Node.js, Express
* **Base de Datos & ORM:** PostgreSQL, Prisma ORM
* **Infraestructura y DevOps:** Docker (contenedorización de servicios), Git
* **Herramientas de Desarrollo:** Postman, Visual Studio Code

---

## 🛠️ Instrucciones de Inicio Rápido (Local)

El proyecto incluye scripts preparados para facilitar la inicialización y el apagado local de todos los servicios simultáneamente:

* **Iniciar todos los servicios:** Ejecuta el archivo `START_ALL.bat` o el script de PowerShell `START_ALL.ps1`.
* **Detener todos los servicios:** Ejecuta el archivo `STOP_ALL.bat` o el script de PowerShell `STOP_ALL.ps1`.
