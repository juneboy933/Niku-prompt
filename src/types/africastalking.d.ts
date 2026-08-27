declare module 'africastalking' {
  type AfricaTalkingOptions = {
    username: string;
    apiKey: string;
  };

  type SmsSendOptions = {
    to: string[];
    message: string;
  };

  type AfricaTalkingClient = {
    SMS: {
      send(options: SmsSendOptions): Promise<unknown>;
    };
  };

  function AfricasTalking(options: AfricaTalkingOptions): AfricaTalkingClient;

  export = AfricasTalking;
}
