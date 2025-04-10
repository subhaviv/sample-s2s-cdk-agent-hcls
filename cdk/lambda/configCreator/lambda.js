const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

exports.handler = async (event) => {
  console.log("Event:", JSON.stringify(event));

  if (event.RequestType === "Delete") {
    return { PhysicalResourceId: event.PhysicalResourceId };
  }

  const { userPoolId, clientId, cloudFrontUrl, bucketName, cognitoDomain } =
    event.ResourceProperties;

  if (!bucketName) {
    throw new Error("bucketName is not set in ResourceProperties");
  }

  // Create the config.js content
  const configContent = `window.APP_CONFIG = { 
    cognitoUserPoolId: '${userPoolId}', 
    cognitoAppClientId: '${clientId}', 
    backendEndpoint: '${cloudFrontUrl}/api',
    appUrl: '${cloudFrontUrl}',
    cognitoDomain: '${cognitoDomain}'
  };`;

  // Initialize S3 client
  const s3Client = new S3Client({ region: process.env.AWS_REGION });

  try {
    // Upload config to S3
    const params = {
      Bucket: bucketName,
      Key: "config.js",
      Body: configContent,
      ContentType: "application/javascript",
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    console.log("Successfully uploaded config.js");

    return {
      PhysicalResourceId: Date.now().toString(),
      Data: {
        configContent: configContent,
      },
    };
  } catch (error) {
    console.error("Error uploading to S3:", error);
    throw error;
  }
};
