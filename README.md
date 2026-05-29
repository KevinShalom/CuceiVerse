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

## 🚀 Instalación y Ejecución

Al ser una arquitectura modular, cada servicio se instala y se ejecuta de manera independiente desde su respectivo directorio. Asegúrate de tener instalado **Node.js (v18+)**, **Python 3.9+**, **Docker** y una instancia de **PostgreSQL** activa.

---

### 1. CuceiVerse WEB (Core & Frontend)

Este módulo contiene tanto el frontend (React) como el backend principal (NestJS).

#### **Backend (NestJS)**
1. Navega al directorio:
   ```bash
   cd "CuceiVerse WEB/cuceiverse-backend"
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Configura tus variables de entorno creando un archivo `.env` en la raíz de la carpeta basándote en la base de datos que estés utilizando:
   ```env
   DATABASE_URL="postgresql://usuario:contraseña@localhost:5432/cuceiverse?schema=public"
   JWT_SECRET="tu_jwt_secret"
   ```
4. Genera el cliente de Prisma y ejecuta las migraciones de la base de datos:
   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```
5. Inicia el servidor en modo desarrollo:
   ```bash
   npm run start:dev
   ```

#### **Frontend (React)**
1. Navega al directorio:
   ```bash
   cd "CuceiVerse WEB/cuceiverse-web"
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Ejecuta el servidor de desarrollo local:
   ```bash
   npm run dev
   ```

---

### 2. Horarios API (Microservicio de Scraping)

Este microservicio se encarga de la extracción automatizada de horarios mediante Python.

1. Navega al directorio:
   ```bash
   cd "Horarios API"
   ```
2. Se recomienda crear e inicializar un entorno virtual:
   ```bash
   python -m venv venv
   # En Windows:
   .\venv\Scripts\activate
   # En macOS/Linux:
   source venv/bin/activate
   ```
3. Instala los requerimientos:
   ```bash
   pip install -r requirements.txt
   ```
4. Ejecuta el servicio:
   ```bash
   python main.py
   ```

---

### 3. habbo-avatar-generator (Servicio de Gamificación)

Este servicio está preparado para ser levantado rápidamente mediante contenedores Docker.

1. Navega al directorio:
   ```bash
   cd "habbo-avatar-generator"
   ```
2. Levanta el contenedor de Docker:
   ```bash
   docker compose up --build
   ```
   *Nota: Esto iniciará el generador de avatares en el puerto configurado dentro de Docker.*

