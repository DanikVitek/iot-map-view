import logo from "./logo.svg";

/** @type {JSX.Element} */
function App() {
    return (
        <div class="text-center">
            <header class="flex min-h-screen flex-col items-center justify-center bg-[#282c34] text-[calc(10px+2vmin)] text-white">
                <img src={logo} class="pointer-events-none h-[40vmin] animate-[spin_infinite_20s_linear]" alt="logo" />
                <p>
                    Edit <code>src/App.jsx</code> and save to reload.
                </p>
                <a
                    class="text-[#b318f0]"
                    href="https://github.com/solidjs/solid"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Learn Solid
                </a>
            </header>
        </div>
    );
}

export default App;
