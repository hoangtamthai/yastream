async function getOnlineUser(baseUrl, shareId) {
  const response = await fetch(`${baseUrl}/api/share/${shareId}`);
  const data = await response.json();
  const token = data.token;
  const websiteId = data.websiteId;
  const activeUrl = `${baseUrl}/api/websites/${websiteId}/active`;
  const activeRes = await fetch(activeUrl, {
    headers: {
      "x-umami-share-token": token,
      "x-umami-share-context": 1,
      Referer: `${baseUrl}/share/${shareId}`,
    },
  });
  const result = await activeRes.json();
  const online = result.visitors;
  const onlineLink = document.getElementById("active");
  if (onlineLink) {
    const text = `${online} Online`;
    onlineLink.textContent = text;
  }
  return online;
}

