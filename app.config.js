module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_WEB_ROOT !== "1") return config;

  const experiments = { ...config.experiments };
  delete experiments.baseUrl;
  return { ...config, experiments };
};
