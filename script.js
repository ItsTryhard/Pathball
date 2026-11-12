
function utworzPokoj() {
    const kod = Math.floor(
        100000 + Math.random() * 900000
    );

    document.getElementById("komunikat")
        .textContent = "Twój kod pokoju: " + kod;
}

function dolaczDoPokoju() {
    const kod = document.getElementById("kodPokoju").value;

    if (kod.length === 6) {
        document.getElementById("komunikat")
            .textContent = "Wpisano kod: " + kod;
    } else {
        document.getElementById("komunikat")
            .textContent = "Wpisz prawidłowy kod!";
    }
}
