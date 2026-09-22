"use strict";

document.addEventListener("DOMContentLoaded", function() {

    // définition de la carte 
    const mymap = L.map('map', { 
        center: [47.24, 6.01], 
        zoom: 14 
    });
    // ajout du tileset classique d'OpenStreetMap
    L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', { 
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(mymap);
    
    // URL de l'API servant les données
    const BASE_URL = "https://ginkobus-pwa.alwaysdata.net"
    // données manipulées (sera alimenté par les données récupérées du serveur ci-dessus)
    const data = { }
    
    // récuparation des stations 
    fetch(BASE_URL + "/stations").then(async function(res) {
        if (res.ok) {
            const stations = await res.json();
            init("stations", stations)
        }
    });  
    // récupération des lignes
    fetch(BASE_URL + "/lignes").then(async function(res) {
        if (res.ok) {
            const lignes = await res.json();
            init("lignes", lignes);
        }
    });
    // récupération des circuits
    fetch(BASE_URL + "/circuits").then(async function(res) {
        if (res.ok) {
            const circuits = await res.json();
            init("circuits", circuits);
        }
    });

    
    function init(type, obj) {
        data[type] = obj;
        // vérifie si toutes les données ont été récupérées
        if (data.circuits && data.lignes && data.stations) {
            // ID des stations autour de ma position (partie 4)
            data.aroundMe = [];
            // affichage des lignes dans le menu
            displayLignes(data.lignes);
            // suppression de l'indication de chargement
            document.querySelector("aside").style.display = "none";
        }
    }


    /**
     * Filtre les lignes pour ne garder que celles qui nous intéressent. 
     * @param {Ligne} l ligne à tester
     * @returns true si la ligne est intéressante, false sinon. 
     */
    function filtre(l) {
        return l.numero.startsWith("L") || l.numero.startsWith("T") || l.id == l.numero && l.id <= 12;
    }


    /**
     * Affichage des lignes dans le menu de navigation
     * @param {Ligne} lignes 
     */
    function displayLignes(lignes) {
        const nav = document.querySelector("nav");
        for (let l in lignes) {
            l = lignes[l];
            if (filtre(l)) {
                // génération du label permettant de sélectionner la ligne
                const label = document.createElement("label");
                label.innerHTML = `<input type="checkbox" value="${l.id}"> ${l.numero} - ${l.nom}`;
                label.style.backgroundColor = "#" + l.bg;
                label.style.color = "#" + l.fg;
                label.querySelector("input").addEventListener("change", refresh);
                nav.appendChild(label);
                // ajoute les tracés des lignes
                l.circuit = l.circuit.map(id => data.circuits[id].map(o => [o.lat, o.lon])).map(list => L.polyline(list,{color: "#"+l.bg}));
            }
            else {
                // ligne qui n'est pas dans la liste --> on la retire
                delete lignes[l.id];
            }
        }
        
        // filtrage des stations
        const stations = data.stations;
        for (let st in stations) {
            const stLignes = Object.keys(stations[st].lignes).filter(l => lignes[l]);
            if (stLignes.length == 0) {
                // station qui n'est reliée à aucune ligne utilisée --> on la retire 
                delete stations[st];
            }
            else {
                // station légitime --> on lui ajoute son marker
                const s = stations[st];
                s.marker = L.marker([Number(s.lat), Number(s.lon)]).bindPopup(popup.bind(null,s));
                s.marker.getPopup().on('remove', function() {
                    document.querySelector("footer").style.display = "none";
                });
            }
        }
    }

    /**
     * Appelée à chaque affichage de popup : 
     *  - construit le contenu de la popup
     *  - récupère le prochain horaire de passage et affiche le temps d'attente
     * @param {Station} station 
     * @returns un élément HTMLDivElement qui sert de conteneur à ce qui est affiché dans la popup
     */
    function popup(station) {
        // construction du contenu de la popup
        const r = document.createElement("div");
        r.innerHTML += station.nom + "<br>";
        r.className = "popup";
        // construction du footer
        const footer = document.querySelector("footer");
        footer.innerHTML = `<h2>Station ${station.nom}</h2><p>Prochain(s) passage(s) :</p>`;
        const table = document.createElement("table");
        for (let l in station.lignes) {
            if (data.lignes[l]) {
                const span = document.createElement("span");
                span.style.backgroundColor = "#" + data.lignes[l].bg;
                span.style.color = "#" + data.lignes[l].fg;
                span.innerHTML = data.lignes[l].numero;
                span.dataset.ligne = l;
                span.addEventListener("click", function() {
                    document.querySelector(`nav input[value='${this.dataset.ligne}']`).click();
                });
                const tr1 = document.createElement("tr");
                const td1 = document.createElement("td");
                td1.colSpan = 2;
                td1.style.backgroundColor = "#" + data.lignes[l].bg;
                td1.style.color = "#" + data.lignes[l].fg;
                td1.innerHTML = data.lignes[l].numero;
                tr1.appendChild(td1);
                table.appendChild(tr1);

                for (let variante in station.lignes[l]) {
                    const tr = document.createElement("tr");
                    const td1 = document.createElement("td");
                    const td2 = document.createElement("td");
                    td1.innerHTML = station.lignes[l][variante];
                    td2.innerHTML = "..."
                    tr.appendChild(td1);
                    tr.appendChild(td2);
                    td2.dataset.ligne = l;
                    td2.dataset.variante = variante;
                    table.appendChild(tr);
                }
                r.appendChild(span);
            }
            footer.appendChild(table);
            footer.style.display = "block";
        }
        // récupération des horaires du jour pour la station
        const now = new Date();
        const AAAA = now.getFullYear();
        let MM = now.getMonth()+1;
        MM = (MM < 10) ? `0${MM}` : MM;
        let JJ = now.getDate();
        JJ = JJ < 10 ? `0${JJ}` : JJ;    
        fetch(`${BASE_URL}/horairesparstation/${station.id}/${AAAA}${MM}${JJ}`).then(async function(res) {
            const tabs = await res.json();
            for (let l in tabs) {
                if (data.lignes[l]) {
                    for (let variante in tabs[l]) {
                        const delay = findNextTimeForStation(tabs[l][variante], now.getHours(), now.getMinutes());
                        const td = document.querySelector(`footer td[data-ligne='${l}'][data-variante='${variante}']`);
                        td && (td.innerHTML = isFinite(delay) ? delay + " min" : "/");
                    }
                }
            }
        });
        return r;
    }

    
    /**
     * Calcule le délai entre l'horaire courant et le prochain passage. 
     * @param {Array} tab tableau d'horaires pour la journée
     * @param {Number} HH heures de l'horaire courant
     * @param {Number} MM minutes de l'horaire courant
     * @returns Le temps d'attente en minutes, +Infinity s'il n'existe pas de prochain passage.
     */
    function findNextTimeForStation(tab, HH, MM) {
        const min1 = HH * 60 + MM;
        let delay = Infinity;
        for (let horaire of tab) {
            const [h,m] = horaire.split(":").map(Number);
            const min2 = h * 60 + m;
            if (min1 <= min2 && delay > min2-min1) {
                delay = min2-min1;
            }
        }
        return delay;
    }


    /**
     * Met à jour l'affichage en cachant/montrant les lignes qui sont sélectionnées
     */
    function refresh() {
        // liste des lignes qui ont une case cochée
        const selectedLines = [...document.querySelectorAll("nav input:checked")].map(e => e.value);
        // affichage (ou pas) des stations
        for (let st in data.stations) {
            const s = data.stations[st];
            if (selectedLines.some(l => s.lignes[l]) || data.aroundMe.indexOf(st) >= 0) {
                s.marker.addTo(mymap);
            }
            else {
                s.marker.remove();
            }
        }
        // affichage (ou pas) des lignes
        for (let l in data.lignes) {
            if (selectedLines.indexOf(l) >= 0) {
                // affiche les lignes
                data.lignes[l].circuit.forEach(c => c.addTo(mymap));
            }
            else {
                // cache les lignes
                data.lignes[l].circuit.forEach(c => c.remove());
            }
        }
    }

    // disque bleu
    let circle = null;
    // activation / desactivation de la case "stations autour de moi"
    document.getElementById("cbAroundMe").addEventListener("change", function() {
        if (this.checked) {
            if (navigator.geolocation) {
                // 
                document.querySelector("aside").style.display = "block";
                navigator.geolocation.getCurrentPosition(function(pos) {
                    const dist = Number(document.querySelector("nav #radius").value);
                    data.aroundMe = getStationsAtDistance(pos.coords, dist);
                    data.aroundMe.forEach(s => data.stations[s].marker.addTo(mymap));
                    if (circle) {
                        circle.remove();
                    }
                    // dessin du cercle
                    circle = L.circle([pos.coords.latitude, pos.coords.longitude], {radius: dist, color: "blue", fillColor: "lightblue", fillOpacity: 0.5}).addTo(mymap);
                    // centrage de la vue
                    mymap.setView([pos.coords.latitude, pos.coords.longitude]);
                }, function() {
                    alert("Erreur sur l'utilisation de la géolocalisation.");
                });
                document.querySelector("aside").style.display = "none";
            }
        }
        else {
            data.aroundMe.forEach(s => data.stations[s].marker.remove());
            circle && circle.remove();
            circle = null;
            data.aroundMe = [];
            refresh();
        }
        document.querySelector("#radius").disabled = this.checked;
    });

    /**
     * Calcul des stations autour de la position passée en paramètre
     * @param {Object} position objet {latitude,longitude} représentant la posistion de référence
     * @param {number} dist distance (en mètres) autour de la position
     * @returns un tableau de stations dans le rayon demandé
     */
    function getStationsAtDistance({latitude, longitude}, dist) {
        return Object.keys(data.stations).filter(s => distance(latitude, longitude, data.stations[s].lat, data.stations[s].lon) <= dist);
    }

    /**
     * Calcul de la formule de haversine.
     * Repris directement de https://www.movable-type.co.uk/scripts/latlong.html
     * @param {number} lat1 latitude du premier point
     * @param {number} lon1 longitude du premier point
     * @param {number} lat2 latitude du second point
     * @param {number} lon2 longitude du second point
     * @returns la distance entre les deux points exprimée en mètres.
     */
    function distance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI/180; // φ, λ in radians
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c; // in metres
    }


    // -- Affichage du menu -- //
    // 1. Clic sur le bloc nav
    document.querySelector("nav").addEventListener("click", function(e) {
        if (e.target == this) {
            this.classList.toggle("show");
            return;
        }
    });
    // 2. Appui sur la touche ESC
    document.addEventListener("keydown", function(e) {
        if (e.code === "Escape") {
            document.querySelector("nav").classList.toggle("show");
        }
    })
    


});