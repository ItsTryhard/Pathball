
const mainMenu = document.getElementById("mainMenu");
const gameScreen = document.getElementById("gameScreen");
const gameTitle = document.getElementById("gameTitle");

function playFriend() {
    openGame("Play vs friend");
}

function playBot() {
    openGame("Play vs bot");
}

function openGame(mode) {
    mainMenu.classList.add("hidden");
    gameScreen.classList.remove("hidden");

    gameTitle.textContent = mode;
}

function backToMenu() {
    gameScreen.classList.add("hidden");
    mainMenu.classList.remove("hidden");
}
