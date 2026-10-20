export function parseContentFactoryArgs(argv) {
  return Object.fromEntries(
    argv
      .filter((value) => value.startsWith("--"))
      .map((value) => {
        const [key, ...rest] = value.slice(2).split("=");
        return [key, rest.length ? rest.join("=") : true];
      })
  );
}
